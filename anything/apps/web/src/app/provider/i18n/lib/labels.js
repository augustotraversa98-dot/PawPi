// Display names of stored values (provider/i18n/offerings.js). A value without a name is shown as stored.
import offerings from "../offerings";

const named = (group) => (value, lang) =>
  Object.hasOwn(offerings[lang][group], value) ? offerings[lang][group][value] : value;

export const providerTypeOption = named("providerTypes");
export const providerTypeName = named("typeNames");
export const capabilityName = named("capabilities");
export const roleName = named("roles");
export const bookingStatusName = named("bookingStatus");

/** `section` is the section's English name, as groupedCapabilityOptions() returns it. */
export function sectionName(section, lang) {
  const key = Object.keys(offerings.en.sections).find((k) => offerings.en.sections[k] === section);
  return key ? offerings[lang].sections[key] : section;
}
