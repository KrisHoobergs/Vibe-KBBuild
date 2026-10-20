import {
  OperationNodeTransformer,
  type CreateIndexNode,
  type CreateTableNode,
  type KyselyPlugin,
  type LimitNode,
  type OnConflictNode,
  type OnDuplicateKeyNode,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type QueryId,
  type QueryResult,
  type ReturningNode,
  type RootOperationNode,
  type SelectQueryNode,
  type UnknownRow,
} from "kysely";

// Strenge Kysely-plugin voor SQL Server, alleen buiten productie (dev en de
// testscripts). Kysely compileert sommige constructies zonder fout naar
// ongeldige T-SQL; deze plugin weigert ze meteen met een duidelijke melding,
// zodat zo'n fout bij het ontwikkelen opvalt in plaats van op de server.
//
// De hele boom wordt nagelopen (ook subquery's en CTE's); de query zelf blijft
// ongewijzigd. Ruwe SQL (sql`…`) wordt niet gecontroleerd.

const RIJVERGRENDELING = new Set(["ForUpdate", "ForNoKeyUpdate", "ForShare", "ForKeyShare", "NoWait", "SkipLocked"]);

export class MssqlBewakerFout extends Error {
  constructor(wat: string) {
    super(`Werkt niet op SQL Server: ${wat}`);
    this.name = "MssqlBewakerFout";
  }
}

class Controleur extends OperationNodeTransformer {
  protected override transformSelectQuery(node: SelectQueryNode, queryId?: QueryId): SelectQueryNode {
    if (node.fetch && !node.offset) throw new MssqlBewakerFout(".fetch() zonder .offset()");
    if (node.distinctOn) throw new MssqlBewakerFout(".distinctOn()");
    if (node.endModifiers?.some((m) => m.modifier && RIJVERGRENDELING.has(m.modifier))) {
      throw new MssqlBewakerFout(".forUpdate()/.forShare() en andere rijvergrendelingen");
    }
    return super.transformSelectQuery(node, queryId);
  }

  protected override transformLimit(): LimitNode {
    throw new MssqlBewakerFout(".limit(): gebruik .top() of .orderBy(…).offset().fetch()");
  }

  protected override transformReturning(): ReturningNode {
    throw new MssqlBewakerFout(".returning…(): gebruik .output…() of lees de rij apart");
  }

  protected override transformOnConflict(): OnConflictNode {
    throw new MssqlBewakerFout(".onConflict(): vang isUniqueViolation op of gebruik MERGE");
  }

  protected override transformOnDuplicateKey(): OnDuplicateKeyNode {
    throw new MssqlBewakerFout(".onDuplicateKeyUpdate(): vang isUniqueViolation op of gebruik MERGE");
  }

  protected override transformCreateTable(node: CreateTableNode, queryId?: QueryId): CreateTableNode {
    if (node.ifNotExists) throw new MssqlBewakerFout(".ifNotExists(): gebruik IF OBJECT_ID(N'dbo.x', N'U') IS NULL");
    return super.transformCreateTable(node, queryId);
  }

  protected override transformCreateIndex(node: CreateIndexNode, queryId?: QueryId): CreateIndexNode {
    if (node.ifNotExists) throw new MssqlBewakerFout(".ifNotExists(): gebruik IF NOT EXISTS (SELECT 1 FROM sys.indexes …)");
    return super.transformCreateIndex(node, queryId);
  }
}

export class MssqlBewaker implements KyselyPlugin {
  readonly #controleur = new Controleur();

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    // Alleen controleren: de originele node gaat ongewijzigd door.
    this.#controleur.transformNode(args.node, args.queryId);
    return args.node;
  }

  async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    return args.result;
  }
}

/** De plugins voor een SQL Server-Kysely: de bewaker alleen buiten productie. */
export function mssqlPlugins(): KyselyPlugin[] {
  return process.env.NODE_ENV === "production" ? [] : [new MssqlBewaker()];
}
