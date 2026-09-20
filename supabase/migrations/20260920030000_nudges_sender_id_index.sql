-- Performance advisor finding right after 20260920020000_nudges.sql: the
-- sender_id foreign key had no covering index.
CREATE INDEX nudges_sender_id_idx ON public.nudges (sender_id);
