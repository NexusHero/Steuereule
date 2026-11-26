// The scenario groups CI runs in parallel, one job each, named after what they cover. A new scenario goes into the
// group its persona belongs to; scenario-groups.test.mjs fails until it is in exactly one. The split keeps the
// slowest group near the slowest of the earlier round-robin shards (run 45802651091: 25 ≈ 145 s, 27 ≈ 90 s,
// 02+03 ≈ 33 s, the rest 3–39 s), which is why 04 sits with capital rather than with the families.
export const SCENARIO_GROUPS = {
  'employees-families': { title: 'employees & families', units: ['01', '06', '07', '13', '14', '16', '25'] },
  'cross-border-ch': { title: 'cross-border CH', units: ['02+03', '12', '15', '18', '27'] },
  'capital-pensions-self-employed': { title: 'capital, pensions & self-employed', units: ['04', '05', '09', '10', '11', '17', '26'] },
  'navigation-dialogs-chat': { title: 'navigation, dialogs & chat', units: ['08', '19', '20', '21', '22', '23', '24'] },
}

/** Every way the groups disagree with the units that exist; empty when each unit is in exactly one group. */
export function groupProblems(unitIds, groups = SCENARIO_GROUPS) {
  const problems = []
  for (const id of [...unitIds].sort()) {
    const owners = Object.keys(groups).filter((key) => groups[key].units.includes(id))
    if (owners.length === 0) problems.push(`scenario ${id} is in no group`)
    if (owners.length > 1) problems.push(`scenario ${id} is in more than one group (${owners.join(', ')})`)
  }
  for (const [key, group] of Object.entries(groups)) {
    for (const id of group.units) if (!unitIds.includes(id)) problems.push(`group ${key} names scenario ${id}, which does not exist`)
  }
  return problems
}

/** The unit ids of one group, by its key. */
export function unitsOfGroup(key, groups = SCENARIO_GROUPS) {
  const group = groups[key]
  if (group === undefined) throw new Error(`unknown scenario group '${key}'; known: ${Object.keys(groups).join(', ')}`)
  return group.units
}
