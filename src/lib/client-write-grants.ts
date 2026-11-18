/**
 * Computes, from the migration files alone, which INSERT / UPDATE / DELETE privileges the client roles
 * (`anon`, `authenticated`) hold on each table in `public`. Used by client-write-grants-guard.test.ts.
 *
 * The one thing a migration cannot show is Supabase's platform default: every table created BEFORE migration
 * 20261006120000 got INSERT/UPDATE/DELETE (and more) for anon and authenticated without any GRANT in a file.
 * That migration revoked anon's writes on all tables and made later tables start empty, so this model gives
 * implicit full write grants to tables created in earlier migrations and nothing to later ones.
 *
 * Modelled: CREATE TABLE, DROP TABLE, ALTER TABLE ... RENAME TO, GRANT/REVOKE on named tables or
 * ALL TABLES IN SCHEMA public, column-level privileges, the PUBLIC pseudo-role (effective = own + PUBLIC), and
 * that a table-level REVOKE also removes column-level grants of that privilege. Comments and dollar-quoted
 * function bodies are stripped first, so a commented-out or in-function statement is never counted.
 * Not modelled (the post-deploy query in docs/database-privileges.md covers them): tables created inside
 * dynamic SQL or DO blocks, ALTER DEFAULT PRIVILEGES effects on already-created tables (none exist), and
 * tables created by roles other than the migration role.
 */
export const DEFAULT_GRANTS_CUTOFF = "20261006120000";

export type WritePriv = "INSERT" | "UPDATE" | "DELETE";
const WRITE_PRIVS: WritePriv[] = ["INSERT", "UPDATE", "DELETE"];
type Role = "anon" | "authenticated" | "public";
const ROLES: Role[] = ["anon", "authenticated", "public"];

type RoleGrant = { table: Set<WritePriv>; cols: Map<WritePriv, Set<string>> };
type TableGrants = Record<Role, RoleGrant>;

const emptyRole = (): RoleGrant => ({ table: new Set(), cols: new Map() });
const emptyTable = (): TableGrants => ({
  anon: emptyRole(),
  authenticated: emptyRole(),
  public: emptyRole(),
});

export function stripSql(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, "")
    .replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"([a-z_0-9]+)"/gi, "$1");
}

/** Splits on commas that are not inside parentheses. */
function splitTop(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const bare = (name: string) => name.trim().toLowerCase().replace(/^public\./, "");

export type ClientWriteGrant = {
  role: "anon" | "authenticated";
  table: string;
  priv: WritePriv;
  /** Sorted column list for a column-level privilege; null for a table-level one. */
  columns: string[] | null;
};

export function computeClientWriteGrants(
  migrations: { version: string; sql: string }[],
  upToVersionExclusive?: string,
): ClientWriteGrant[] {
  const tables = new Map<string, TableGrants>();
  const sorted = [...migrations].sort((a, b) => (a.version < b.version ? -1 : 1));

  const grantTables = (names: string[]) =>
    names.map((n) => {
      if (!tables.has(n)) tables.set(n, emptyTable());
      return tables.get(n)!;
    });

  for (const { version, sql } of sorted) {
    if (upToVersionExclusive && version >= upToVersionExclusive) break;
    const statements = stripSql(sql)
      .split(";")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    for (const st of statements) {
      let m = /^CREATE (?:UNLOGGED )?TABLE (?:IF NOT EXISTS )?(?:([a-z_0-9]+)\.)?([a-z_0-9]+)/i.exec(st);
      if (m) {
        if (m[1] && m[1].toLowerCase() !== "public") continue; // another schema
        const name = m[2].toLowerCase();
        const t = emptyTable();
        if (version < DEFAULT_GRANTS_CUTOFF) {
          for (const r of ["anon", "authenticated"] as const)
            for (const p of WRITE_PRIVS) t[r].table.add(p);
        }
        if (!tables.has(name)) tables.set(name, t);
        continue;
      }
      m = /^DROP TABLE (?:IF EXISTS )?(.+?)(?: CASCADE| RESTRICT)?$/i.exec(st);
      if (m) {
        for (const n of splitTop(m[1])) tables.delete(bare(n));
        continue;
      }
      m = /^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?(?:public\.)?([a-z_0-9]+) RENAME TO ([a-z_0-9]+)$/i.exec(st);
      if (m) {
        const from = m[1].toLowerCase();
        const to = m[2].toLowerCase();
        if (tables.has(from)) {
          tables.set(to, tables.get(from)!);
          tables.delete(from);
        }
        continue;
      }
      m = /^(GRANT|REVOKE)\s+(?:GRANT OPTION FOR\s+)?(.+?)\s+ON\s+(.+?)\s+(TO|FROM)\s+(.+)$/i.exec(st);
      if (!m) continue;
      const [, verb, privPart, onPart, , roleList] = m;
      const on = onPart.trim();
      let targetNames: string[];
      if (/^ALL TABLES IN SCHEMA public$/i.test(on)) targetNames = [...tables.keys()];
      else if (/^(FUNCTION|ALL FUNCTIONS|PROCEDURE|SCHEMA|SEQUENCE|ALL SEQUENCES|DATABASE|TYPE|DOMAIN|LANGUAGE|LARGE OBJECT|FOREIGN|TABLESPACE|PARAMETER)\b/i.test(on))
        continue;
      else
        targetNames = splitTop(on.replace(/^TABLE\s+/i, ""))
          .filter((n) => !n.includes(".") || n.toLowerCase().startsWith("public."))
          .map(bare);
      const roles = splitTop(roleList.replace(/\s+WITH GRANT OPTION$/i, "").replace(/\s+(CASCADE|RESTRICT)$/i, ""))
        .map((r) => r.replace(/^GROUP\s+/i, "").toLowerCase())
        .filter((r): r is Role => (ROLES as string[]).includes(r));
      if (roles.length === 0) continue;

      // [priv, columns|null] pairs; ALL means every write privilege at table level.
      const items: [WritePriv, string[] | null][] = [];
      for (const raw of splitTop(privPart)) {
        const pm = /^([A-Z ]+?)\s*(?:\((.*)\))?$/i.exec(raw);
        if (!pm) continue;
        const word = pm[1].trim().toUpperCase();
        const cols = pm[2] ? pm[2].split(",").map((c) => c.trim().toLowerCase()) : null;
        if (word === "ALL" || word === "ALL PRIVILEGES") for (const p of WRITE_PRIVS) items.push([p, cols]);
        else if ((WRITE_PRIVS as string[]).includes(word)) items.push([word as WritePriv, cols]);
      }

      for (const t of grantTables(targetNames)) {
        for (const role of roles) {
          const g = t[role];
          for (const [priv, cols] of items) {
            if (verb.toUpperCase() === "GRANT") {
              if (cols) {
                if (!g.cols.has(priv)) g.cols.set(priv, new Set());
                for (const c of cols) g.cols.get(priv)!.add(c);
              } else g.table.add(priv);
            } else if (cols) {
              for (const c of cols) g.cols.get(priv)?.delete(c);
            } else {
              g.table.delete(priv);
              g.cols.delete(priv);
            }
          }
        }
      }
    }
  }

  const out: ClientWriteGrant[] = [];
  for (const [table, t] of tables) {
    for (const role of ["anon", "authenticated"] as const) {
      for (const priv of WRITE_PRIVS) {
        if (t[role].table.has(priv) || t.public.table.has(priv)) {
          out.push({ role, table, priv, columns: null });
          continue;
        }
        const cols = new Set([...(t[role].cols.get(priv) ?? []), ...(t.public.cols.get(priv) ?? [])]);
        if (cols.size > 0) out.push({ role, table, priv, columns: [...cols].sort() });
      }
    }
  }
  return out.sort((a, b) =>
    `${a.role}.${a.table}.${a.priv}`.localeCompare(`${b.role}.${b.table}.${b.priv}`),
  );
}

export const grantKey = (g: ClientWriteGrant) =>
  `${g.role}.${g.table}.${g.priv}${g.columns ? `(${g.columns.join(",")})` : ""}`;
