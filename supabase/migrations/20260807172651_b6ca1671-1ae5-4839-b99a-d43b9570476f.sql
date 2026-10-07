REVOKE ALL ON FUNCTION public.sync_opportunity_dates() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_date_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_opportunity_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_submission_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;