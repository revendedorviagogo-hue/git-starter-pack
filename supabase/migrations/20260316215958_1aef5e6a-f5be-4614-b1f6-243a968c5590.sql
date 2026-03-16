CREATE OR REPLACE FUNCTION public.get_cron_logs(max_rows integer DEFAULT 50)
RETURNS TABLE(
  runid bigint,
  jobname text,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT d.runid, j.jobname, d.status, d.return_message, d.start_time, d.end_time
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  ORDER BY d.start_time DESC
  LIMIT max_rows;
$$;