/**
 * Telling profiles apart in a list.
 *
 * Two of them can honestly end up with the same name: the upgrade names the
 * look someone already had, forking the default names its copy the same way,
 * and nothing stops a user typing a name twice. A picker showing "My look"
 * above "My look" asks a question with no answer, so the later ones are
 * numbered — in list order, so a name does not move around as others are
 * added and removed above it.
 *
 * Presentation only. The stored name is left alone: numbering it would bake a
 * position into the profile, and deleting the first of them would leave a
 * lonely "My look 2".
 */
export function disambiguate(names: string[]): string[] {
  const seen = new Map<string, number>();
  const total = new Map<string, number>();
  for (const name of names) total.set(name, (total.get(name) ?? 0) + 1);

  return names.map(name => {
    // A name used once needs no help, and numbering it would be noise.
    if ((total.get(name) ?? 0) < 2) return name;
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${name} ${n}`;
  });
}
