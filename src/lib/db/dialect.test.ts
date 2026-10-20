// Unittests voor de dialect-hulpfuncties (npm run test:unit).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { foutNummers, isMssqlDeadlock, isUniqueViolation, losseFouten, parseJson, toIso } from "./dialect";

// Zo zien de fouten eruit: pg (DatabaseError met code), tedious (RequestError
// met number) en Kysely-mssql (een array bij meerdere serverfouten).
const pgFout = (code: string) => Object.assign(new Error("duplicate key value violates unique constraint"), { code });
const tediousFout = (number: number) =>
  Object.assign(new Error(`Fout ${number}`), { name: "RequestError", code: "EREQUEST", number });

describe("losseFouten en foutNummers", () => {
  it("een gewone fout wordt een lijst van één", () => {
    const f = pgFout("23505");
    assert.deepEqual(losseFouten(f), [f]);
    assert.deepEqual(losseFouten(undefined), [undefined]);
    assert.deepEqual(losseFouten("tekst"), ["tekst"]);
  });

  it("een array en een AggregateError worden uitgepakt", () => {
    const a = tediousFout(1505);
    const b = tediousFout(1750);
    assert.deepEqual(losseFouten([a, b]), [a, b]);
    assert.deepEqual(losseFouten(new AggregateError([a, b])), [a, b]);
  });

  it("foutNummers: alleen numerieke SQL Server-nummers", () => {
    assert.deepEqual(foutNummers([tediousFout(1505), tediousFout(1750)]), [1505, 1750]);
    assert.deepEqual(foutNummers(tediousFout(2627)), [2627]);
    assert.deepEqual(foutNummers(pgFout("23505")), []);
    assert.deepEqual(foutNummers({ number: "2627" }), []);
    assert.deepEqual(foutNummers(null), []);
    assert.deepEqual(foutNummers([null, 3, "x"]), []);
  });
});

describe("isUniqueViolation", () => {
  it("Postgres: alleen 23505 (ongewijzigd gedrag)", () => {
    assert.equal(isUniqueViolation(pgFout("23505")), true);
    assert.equal(isUniqueViolation(pgFout("23503")), false);
    assert.equal(isUniqueViolation(pgFout("40P01")), false);
    assert.equal(isUniqueViolation({ code: "23505" }), true);
    assert.equal(isUniqueViolation(Object.assign(new Error("x"), { code: "ECONNREFUSED" })), false);
  });

  it("geen fout-object: false", () => {
    for (const w of [null, undefined, "", "23505", 2627, true, {}]) assert.equal(isUniqueViolation(w), false);
  });

  it("SQL Server: 2627 (constraint) en 2601 (unieke index), ook in een array", () => {
    assert.equal(isUniqueViolation(tediousFout(2627)), true);
    assert.equal(isUniqueViolation(tediousFout(2601)), true);
    assert.equal(isUniqueViolation(tediousFout(547)), false);
    assert.equal(isUniqueViolation([tediousFout(2627), tediousFout(3621)]), true);
    assert.equal(isUniqueViolation([tediousFout(1505), tediousFout(1750)]), false);
    assert.equal(isUniqueViolation(new AggregateError([tediousFout(2601)])), true);
    assert.equal(isUniqueViolation([]), false);
  });
});

describe("isMssqlDeadlock", () => {
  it("alleen SQL Server-fout 1205, nooit een Postgres-code", () => {
    assert.equal(isMssqlDeadlock(tediousFout(1205)), true);
    assert.equal(isMssqlDeadlock([tediousFout(3621), tediousFout(1205)]), true);
    assert.equal(isMssqlDeadlock(tediousFout(2627)), false);
    assert.equal(isMssqlDeadlock(pgFout("40P01")), false);
    assert.equal(isMssqlDeadlock(null), false);
  });
});

describe("toIso en parseJson", () => {
  it("toIso: Date en string naar ISO, null blijft null", () => {
    assert.equal(toIso(new Date("2026-01-02T03:04:05.678Z")), "2026-01-02T03:04:05.678Z");
    assert.equal(toIso("2026-01-02T03:04:05.678Z"), "2026-01-02T03:04:05.678Z");
    assert.equal(toIso(null), null);
  });

  it("parseJson: object blijft, string wordt geparsed, ongeldig of leeg geeft de terugval", () => {
    const obj = { a: 1 };
    assert.equal(parseJson(obj, null), obj);
    assert.deepEqual(parseJson('[{"name":"x","slug":"x"}]', []), [{ name: "x", slug: "x" }]);
    assert.deepEqual(parseJson("{kapot", { leeg: true }), { leeg: true });
    assert.deepEqual(parseJson(null, []), []);
    assert.deepEqual(parseJson(undefined, []), []);
  });
});
