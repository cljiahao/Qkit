// The stats strip is two tiles across on a phone, about 118px of text each:
// enough for a count, not for a revenue figure in the display font
// ("$1,804.…") or an item's name. Those tiles take the whole row there.
// A plain module, not part of either tile file: one of them is a Client
// Component, and a Server Component importing a string from it gets a client
// reference, not the string.
export const WIDE_ON_PHONE = "col-span-2 sm:col-span-1";
