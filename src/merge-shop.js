const { isDeepStrictEqual } = require('node:util');

const MISSING = Symbol('missing');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const isRecordArray = value => Array.isArray(value) && value.every(record => isObject(record) && typeof record.id === 'string');
const has = (value, key) => value !== MISSING && Object.prototype.hasOwnProperty.call(value, key);

function mergeShopData(base, submitted, current) {
    const conflicts = [];
    const data = mergeValue(base, submitted, current, [], conflicts);
    return { data: data === MISSING ? {} : data, conflicts };
}

function mergeValue(base, submitted, current, path, conflicts) {
    if (isDeepStrictEqual(submitted, base)) return current;
    if (isDeepStrictEqual(current, base)) return submitted;
    if (isDeepStrictEqual(submitted, current)) return current;

    if (isRecordArray(submitted) && isRecordArray(current) && (base === MISSING || isRecordArray(base))) {
        return mergeRecords(base === MISSING ? [] : base, submitted, current, path, conflicts);
    }

    if (isObject(submitted) && isObject(current) && (base === MISSING || isObject(base))) {
        const result = {};
        const keys = new Set([
            ...(base === MISSING ? [] : Object.keys(base)),
            ...Object.keys(submitted),
            ...Object.keys(current),
        ]);
        for (const key of keys) {
            const previous = has(base, key) ? base[key] : MISSING;
            const next = has(submitted, key) ? submitted[key] : MISSING;
            const live = has(current, key) ? current[key] : MISSING;
            const value = mergeValue(previous, next, live, [...path, key], conflicts);
            if (value !== MISSING) result[key] = value;
        }
        return result;
    }

    conflicts.push(path.join('.'));
    return current;
}

function mergeRecords(base, submitted, current, path, conflicts) {
    const baseById = new Map(base.map(record => [record.id, record]));
    const submittedById = new Map(submitted.map(record => [record.id, record]));
    const currentById = new Map(current.map(record => [record.id, record]));
    const order = [...current.map(record => record.id), ...submitted.map(record => record.id)];
    const seen = new Set();
    const result = [];

    for (const id of order) {
        if (seen.has(id)) continue;
        seen.add(id);
        const previous = baseById.has(id) ? baseById.get(id) : MISSING;
        const next = submittedById.has(id) ? submittedById.get(id) : MISSING;
        const live = currentById.has(id) ? currentById.get(id) : MISSING;
        const record = mergeValue(previous, next, live, [...path, id], conflicts);
        if (record !== MISSING) result.push(record);
    }
    return result;
}

module.exports = mergeShopData;