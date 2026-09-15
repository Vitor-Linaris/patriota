-- Removes reader addresses already written into the audit trail.
--
-- Six call sites used to put the reader's e-mail (or name) into
-- ActivityLog.targetLabel as free text, beside the targetId that already
-- identified them. This table has no readerId, so the RGPD erasure
-- transaction had nothing to find and nothing to clear: the address
-- outlived the account that asked to be forgotten, and came back out of
-- GET /admin/activity unfiltered.
--
-- The code now stores the DETAIL only and resolves the identity live at
-- read time. This cleans up what is already there. Two stored shapes,
-- and the address is on opposite sides of each:
--
--   "<pacote> -> <e-mail>"      the pacote rows; the FIRST half survives
--   "<identity> -- <detail>"    everything else; the SECOND half survives
--
-- Order matters: the pacote rows carry no em-dash, so the second
-- statement would flatten them to empty if it ran first.
--
-- Deliberately blunt in the ambiguous direction: a detail wrongly
-- dropped costs a little context in an admin list, an address wrongly
-- kept is the thing this exists to remove.
UPDATE "ActivityLog"
   SET "targetLabel" = substring("targetLabel" from 1 for position(' → ' in "targetLabel") - 1)
 WHERE "targetType" = 'reader'
   AND position(' → ' in "targetLabel") > 0;

UPDATE "ActivityLog"
   SET "targetLabel" = CASE
         WHEN position(' — ' in "targetLabel") > 0
           THEN substring("targetLabel" from position(' — ' in "targetLabel") + 3)
         ELSE ''
       END
 WHERE "targetType" = 'reader'
   AND position(' → ' in "targetLabel") = 0;
