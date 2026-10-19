-- Where an agent-driven printer actually sends its bytes, decided in Admin
-- rather than on the till.
--
-- The agent on a till can see things Admin cannot: which USB printers are
-- attached, which Windows queues exist. It reports them into agent_outputs on
-- every registration. Admin then writes one of them to agent_target, and the
-- agent picks that up on its next poll - so swapping a till printer for the
-- kitchen one, or moving to a network printer, is a dropdown rather than a
-- trip to the store.
--
-- Both are null for Sunmi cloud printers, which have neither.

alter table printers add column if not exists agent_outputs jsonb;
alter table printers add column if not exists agent_target  text;

comment on column printers.agent_outputs is
  'What the print agent reported it can drive: [{"kind":"usb|queue","name":"...","target":"usbdev:..."}]. Refreshed on each registration.';
comment on column printers.agent_target is
  'Which of agent_outputs the agent should use, chosen in Admin. Null means the agent falls back to whatever is in its own config file.';

select sn, label, agent_target, jsonb_array_length(coalesce(agent_outputs, '[]'::jsonb)) as outputs
from printers
where sn like 'agent:%' or sn like 'usb:%'
order by label;
