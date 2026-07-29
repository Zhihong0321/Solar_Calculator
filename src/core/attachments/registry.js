/**
 * src/core/attachments/registry.js
 *
 * The single source of truth for what an attachment can be.
 *
 * Document types live here, in code, and NOT as a Postgres enum or a lookup
 * table. Adding a document type is the most common change this system will ever
 * see, and it should cost a pull request, not a migration on a live database.
 * ee_attachment.category / doc_type are plain TEXT and are validated against
 * this file on write.
 *
 * Storage subdir is deliberately flat ('attachments'): filenames are already
 * globally unique, and a per-type subdir would multiply R2 prefixes for no gain.
 */

'use strict';

const STORAGE_SUBDIR = 'attachments';

const IMAGE_ONLY = ['image/*'];
const IMAGE_OR_PDF = ['image/*', 'application/pdf'];

/**
 * Floor-bearing types store their floor in metadata_json.floor (0 = ground).
 *
 * The alternative — doc types 'db_ground' / 'db_floor_2' / 'db_floor_3' — reads
 * fine until someone sells a four-storey shoplot, at which point it is a code
 * change plus a migration. One type plus a floor index costs nothing and has no
 * ceiling. The UI still renders three fixed rows by default; how it looks and
 * how it is stored do not have to agree.
 */
const HOUSE_DB_FLOORS = {
    requiredFloors: [0],
    optionalFloors: [1, 2],
    allowMore: true,
    labels: {
        0: 'Ground floor',
        1: 'Second floor',
        2: 'Third floor',
    },
};

const DOC_TYPES = {
    roof_angle: {
        category: 'site_assessment',
        label: 'Roof — all angles',
        hint: 'Wide shots covering every roof face the array could sit on.',
        accept: IMAGE_ONLY,
        maxMB: 10,
        multi: true,
        required: true,
        minCount: 3,
        order: 1,
    },
    roof_closeup: {
        category: 'site_assessment',
        label: 'Roof — close-up',
        hint: 'Close enough to confirm the roof type (tile, metal deck, concrete).',
        accept: IMAGE_ONLY,
        maxMB: 10,
        multi: true,
        required: true,
        minCount: 1,
        order: 2,
    },
    house_db: {
        category: 'site_assessment',
        label: 'House DB',
        hint: 'Distribution board, one per floor. Ground floor is required.',
        accept: IMAGE_ONLY,
        maxMB: 10,
        multi: true,
        required: true,
        minCount: 1,
        floors: HOUSE_DB_FLOORS,
        order: 3,
    },
    inverter_location: {
        category: 'site_assessment',
        label: 'Planned inverter location',
        hint: 'Where the inverter is intended to be mounted.',
        accept: IMAGE_ONLY,
        maxMB: 10,
        multi: true,
        required: true,
        minCount: 1,
        order: 4,
    },
    sunpath: {
        category: 'site_assessment',
        label: 'Sun path direction',
        hint: 'Orientation reference for the array.',
        accept: IMAGE_ONLY,
        maxMB: 10,
        multi: true,
        required: true,
        minCount: 1,
        order: 5,
    },
    house_front: {
        category: 'site_assessment',
        label: 'House front view',
        hint: 'Full front elevation — used for the skylift access assessment.',
        accept: IMAGE_ONLY,
        maxMB: 10,
        multi: true,
        required: true,
        minCount: 1,
        order: 6,
    },
    site_other: {
        category: 'site_assessment',
        label: 'Other site photo',
        hint: 'Anything that does not fit a slot above.',
        accept: IMAGE_OR_PDF,
        maxMB: 10,
        multi: true,
        required: false,
        order: 7,
    },
    pv_system: {
        category: 'drawing',
        label: 'PV System Drawing',
        hint: 'PV system drawing uploaded for the invoice.',
        accept: IMAGE_OR_PDF,
        maxMB: 10,
        multi: true,
        required: false,
        order: 1,
    },
};

const CATEGORIES = {
    site_assessment: {
        label: 'Site Assessment',
        docTypes: Object.keys(DOC_TYPES).filter((k) => DOC_TYPES[k].category === 'site_assessment'),
    },
    drawing: {
        label: 'Engineering Drawings',
        docTypes: Object.keys(DOC_TYPES).filter((k) => DOC_TYPES[k].category === 'drawing'),
    },
};

/**
 * Which records can own an attachment, and how to prove the caller may touch
 * one. Adding an owner type is a single entry here plus its ownership check —
 * no new table, no new column on the parent.
 */
const OWNER_TYPES = {
    invoice: {
        table: 'invoice',
        idColumn: 'bubble_id',
        module: 'invoice-office',
        customerColumn: 'linked_customer',
    },
};

function getDocType(docType) {
    return Object.prototype.hasOwnProperty.call(DOC_TYPES, docType) ? DOC_TYPES[docType] : null;
}

function getOwnerType(ownerType) {
    return Object.prototype.hasOwnProperty.call(OWNER_TYPES, ownerType) ? OWNER_TYPES[ownerType] : null;
}

function listDocTypes(category = null) {
    return Object.entries(DOC_TYPES)
        .filter(([, def]) => !category || def.category === category)
        .sort((a, b) => (a[1].order || 0) - (b[1].order || 0))
        .map(([key, def]) => ({ key, ...def }));
}

/**
 * Normalises a floor value for a floor-bearing doc type.
 *
 * Returns null for types that do not carry floors, so callers can store the
 * result straight into metadata without branching.
 */
function normalizeFloor(docType, rawFloor) {
    const def = getDocType(docType);
    if (!def || !def.floors) return null;
    if (rawFloor === null || rawFloor === undefined || rawFloor === '') return 0;

    const floor = Number(rawFloor);
    if (!Number.isInteger(floor) || floor < 0 || floor > 50) return null;
    return floor;
}

function floorLabel(docType, floor) {
    const def = getDocType(docType);
    if (!def || !def.floors) return null;
    const known = def.floors.labels[floor];
    if (known) return known;
    return `Floor ${floor + 1}`;
}

/**
 * Validates an upload target. Returns { ok, error, docTypeDef, ownerTypeDef }.
 */
function validateTarget({ ownerType, docType }) {
    const ownerTypeDef = getOwnerType(ownerType);
    if (!ownerTypeDef) {
        return { ok: false, error: `"${ownerType}" is not a valid attachment owner type.` };
    }

    const docTypeDef = getDocType(docType);
    if (!docTypeDef) {
        return { ok: false, error: `"${docType}" is not a valid document type.` };
    }

    return { ok: true, docTypeDef, ownerTypeDef };
}

/**
 * Progress for one owner's checklist: which required slots are still empty.
 *
 * Deliberately reports rather than enforces — nothing in the app blocks on this.
 * An agent standing on a roof with one bar of signal should never be locked out
 * of their own invoice by a missing photo.
 */
function checklistProgress(attachments = [], category = 'site_assessment') {
    const counts = new Map();
    for (const row of attachments) {
        if (row.deleted_at) continue;
        counts.set(row.doc_type, (counts.get(row.doc_type) || 0) + 1);
    }

    const slots = listDocTypes(category).map((def) => {
        const count = counts.get(def.key) || 0;
        const minCount = def.required ? (def.minCount || 1) : 0;
        return {
            docType: def.key,
            label: def.label,
            required: Boolean(def.required),
            minCount,
            count,
            satisfied: !def.required || count >= minCount,
        };
    });

    const required = slots.filter((s) => s.required);
    return {
        slots,
        requiredTotal: required.length,
        requiredDone: required.filter((s) => s.satisfied).length,
        complete: required.every((s) => s.satisfied),
    };
}

module.exports = {
    STORAGE_SUBDIR,
    DOC_TYPES,
    CATEGORIES,
    OWNER_TYPES,
    getDocType,
    getOwnerType,
    listDocTypes,
    normalizeFloor,
    floorLabel,
    validateTarget,
    checklistProgress,
};
