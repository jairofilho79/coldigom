/** Fixed UUID — must match api/migrations/006_unknown_material_kind.sql */
export const UNKNOWN_MATERIAL_KIND_ID = 'c7454ea9-3ae0-4548-9cc5-c4187b80641a';

/** Minimum confidence to accept an inferred kind (0..1). */
export const CONFIDENCE_THRESHOLD = 0.72;

/** If top-2 candidates differ by less than this, treat as ambiguous. */
export const AMBIGUITY_DELTA = 0.05;
