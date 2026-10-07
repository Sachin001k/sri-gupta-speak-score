-- Security hardening (Oct 2026)
--  1. Users could promote themselves to admin by updating their own profiles.role.
--  2. topics: anyone could insert/update/delete. Now admin-only writes; reads stay public.
--  3. newsletter_subscriptions: anyone could read/edit/delete every subscriber's email.
--     Now admin-only table access; subscribing goes through SECURITY DEFINER functions.
--  4. debate-recordings bucket: anyone could list every student's recordings.
--     Owners can list their own; playback via public URL is unaffected (bucket stays public).

-- ---------------------------------------------------------------------------
-- Admin helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. Only the database owner (SQL editor / service role) can change profiles.role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.role := 'user';
    ELSE
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role ON public.profiles;
CREATE TRIGGER protect_profile_role
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- ---------------------------------------------------------------------------
-- 2. topics: public read, admin-only writes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can insert topics" ON public.topics;
DROP POLICY IF EXISTS "Anyone can update topics" ON public.topics;
DROP POLICY IF EXISTS "Anyone can delete topics" ON public.topics;
DROP POLICY IF EXISTS "Admins can insert topics" ON public.topics;
DROP POLICY IF EXISTS "Admins can update topics" ON public.topics;
DROP POLICY IF EXISTS "Admins can delete topics" ON public.topics;

CREATE POLICY "Admins can insert topics" ON public.topics
FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update topics" ON public.topics
FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete topics" ON public.topics
FOR DELETE TO authenticated USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. newsletter_subscriptions: admin-only table access
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read newsletter subscriptions" ON public.newsletter_subscriptions;
DROP POLICY IF EXISTS "Anyone can insert newsletter subscriptions" ON public.newsletter_subscriptions;
DROP POLICY IF EXISTS "Anyone can update newsletter subscriptions" ON public.newsletter_subscriptions;
DROP POLICY IF EXISTS "Anyone can delete newsletter subscriptions" ON public.newsletter_subscriptions;
DROP POLICY IF EXISTS "Admins can manage newsletter subscriptions" ON public.newsletter_subscriptions;

CREATE POLICY "Admins can manage newsletter subscriptions" ON public.newsletter_subscriptions
FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Subscribe or change topics. Mirrors the old client-side logic, but runs on the server so
-- visitors never need read access to other subscribers.
-- Returns 'created', 'updated', 'unchanged' or 'taken' (email belongs to another account).
CREATE OR REPLACE FUNCTION public.subscribe_newsletter(p_email text, p_topics text[])
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_uid uuid := auth.uid();
  v_existing public.newsletter_subscriptions%ROWTYPE;
BEGIN
  IF v_email IS NULL OR v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Invalid email address';
  END IF;
  IF p_topics IS NULL OR array_length(p_topics, 1) IS NULL THEN
    RAISE EXCEPTION 'Select at least one topic';
  END IF;

  SELECT * INTO v_existing FROM public.newsletter_subscriptions WHERE email = v_email LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.newsletter_subscriptions (email, topics, user_id)
    VALUES (v_email, p_topics, v_uid);
    RETURN 'created';
  END IF;

  IF v_existing.user_id IS NOT NULL AND v_existing.user_id IS DISTINCT FROM v_uid THEN
    RETURN 'taken';
  END IF;

  IF (SELECT array_agg(t ORDER BY t) FROM unnest(v_existing.topics) t)
     IS NOT DISTINCT FROM (SELECT array_agg(t ORDER BY t) FROM unnest(p_topics) t) THEN
    RETURN 'unchanged';
  END IF;

  UPDATE public.newsletter_subscriptions
  SET topics = p_topics,
      user_id = COALESCE(v_uid, v_existing.user_id),
      updated_at = now()
  WHERE id = v_existing.id;
  RETURN 'updated';
EXCEPTION
  WHEN unique_violation THEN
    RETURN 'unchanged';
END;
$$;

-- Topics the logged-in user is subscribed to (by their account email), for pre-filling the form.
CREATE OR REPLACE FUNCTION public.my_newsletter_topics()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT topics FROM public.newsletter_subscriptions
  WHERE auth.uid() IS NOT NULL
    AND email = lower(trim(auth.jwt() ->> 'email'))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.subscribe_newsletter(text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_newsletter_topics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. debate-recordings: owners list their own files; no public listing
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can read debate recordings" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own debate recordings" ON storage.objects;
CREATE POLICY "Users can read own debate recordings"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'debate-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
