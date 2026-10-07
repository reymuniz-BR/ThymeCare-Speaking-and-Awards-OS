ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS owner_name text;

UPDATE public.opportunities o
SET owner_name = p.full_name
FROM public.profiles p
WHERE o.owner_id = p.id AND o.owner_name IS NULL;