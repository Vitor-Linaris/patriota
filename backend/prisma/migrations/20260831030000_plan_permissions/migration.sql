-- What a reader on each plan may do.
--
-- A separate table from "RolePermissions", not extra rows in it: a
-- reader's plan is not a Role, and the two enums have nothing to say to
-- each other. Keeping them apart is also what stops a staff role from
-- being handed a reader permission by an "everything except X" filter.
--
-- The rows themselves are provisioned by RbacService on boot, from
-- DEFAULT_PLAN_PERMISSIONS, so this migration only makes the shape.
CREATE TABLE "PlanPermissions" (
  "plan"        "ReaderPlan" NOT NULL,
  "permissions" TEXT[],
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlanPermissions_pkey" PRIMARY KEY ("plan")
);
