-- Modération : motif de refus communiqué au vendeur.
-- (Le trigger guard_property_status garantit déjà que seul un admin
--  peut passer une annonce en 'rejected'.)
alter table public.properties
  add column rejection_reason text;
