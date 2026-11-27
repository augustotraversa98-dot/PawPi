// Text the database can hold: no NUL character and no half of a surrogate pair. Anything that is not text is returned
// as it is.
export const cleanText = (value) =>
  typeof value === "string" ? value.replaceAll("\u0000", "").toWellFormed() : value;
