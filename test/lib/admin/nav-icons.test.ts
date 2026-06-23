import { describe, expect, test } from "bun:test";
import { NAV_GROUPS, NAV_KEY } from "../../../src/lib/admin/nav-groups";
import { NAV_ICONS } from "../../../src/app/admin/(dashboard)/_components/admin-nav-icons";

// Guard: the sidebar renders an icon per nav item by looking it up in
// NAV_ICONS keyed by href. A nav item whose href is absent from NAV_ICONS
// renders with no icon (the bug this test prevents). Both maps must stay in
// lockstep with NAV_GROUPS.

const allHrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));

describe("NAV_ICONS coverage", () => {
  test("every nav item href has a matching icon", () => {
    const missing = allHrefs.filter((href) => !(href in NAV_ICONS));
    expect(missing).toEqual([]);
  });

  test("every nav item href has a translation key", () => {
    const missing = allHrefs.filter((href) => !(href in NAV_KEY));
    expect(missing).toEqual([]);
  });
});
