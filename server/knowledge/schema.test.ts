import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import {
  contentPublications,
  knowledgeAssets,
  knowledgeContents,
  knowledgeItems,
  knowledgeSources,
  knowledgeSyncRuns,
  users,
} from "../../drizzle/schema";

describe("Knowledge schema safety constraints", () => {
  it("defaults existing accounts to unverified enterprise access", () => {
    const config = getTableConfig(users);
    const status = config.columns.find(
      column => column.name === "enterpriseAccessStatus"
    );
    expect(status).toMatchObject({ notNull: true, default: "unverified" });
    expect(
      config.columns.find(column => column.name === "enterpriseVerifiedBy")
        ?.notNull
    ).toBe(false);
    expect(
      config.columns.find(column => column.name === "enterpriseVerifiedAt")
        ?.notNull
    ).toBe(false);
    expect(
      config.columns.find(column => column.name === "enterpriseRevokedAt")
        ?.notNull
    ).toBe(false);
  });

  it("keeps large bodies out of MySQL TEXT and makes the active publication slot nullable and unique", () => {
    const contentColumns = getTableConfig(knowledgeContents).columns;
    expect(
      contentColumns
        .find(column => column.name === "bodyMarkdown")
        ?.getSQLType()
    ).toBe("longtext");
    expect(
      contentColumns.find(column => column.name === "bodyHtml")?.getSQLType()
    ).toBe("longtext");

    const publication = getTableConfig(contentPublications);
    expect(
      publication.columns
        .find(column => column.name === "audienceType")
        ?.getSQLType()
    ).toContain("'authenticated_users'");
    expect(
      publication.columns.find(column => column.name === "activeSlotKey")
        ?.notNull
    ).toBe(false);
    expect(
      publication.indexes.find(
        index => index.config.name === "content_publications_active_slot_unique"
      )?.config.unique
    ).toBe(true);
    expect(
      publication.indexes.some(
        index =>
          index.config.columns
            .map(column => ("name" in column ? column.name : ""))
            .join(",") === "contentId,channel,destinationKey" &&
          index.config.unique
      )
    ).toBe(false);
  });

  it("retains unknown source object types as an explicit unsupported item kind", () => {
    expect(
      getTableConfig(knowledgeItems)
        .columns.find(column => column.name === "kind")
        ?.getSQLType()
    ).toContain("'other'");
  });

  it("never cascades knowledge history and uses SET NULL only on nullable references", () => {
    for (const table of [
      knowledgeSources,
      knowledgeSyncRuns,
      knowledgeItems,
      knowledgeContents,
      knowledgeAssets,
      contentPublications,
      users,
    ]) {
      const config = getTableConfig(table);
      for (const foreignKey of config.foreignKeys) {
        expect(foreignKey.onDelete).not.toBe("cascade");
        if (foreignKey.onDelete === "set null") {
          for (const column of foreignKey.reference().columns)
            expect(column.notNull).toBe(false);
        }
      }
    }
    expect(
      getTableConfig(knowledgeItems).foreignKeys.some(
        foreignKey =>
          foreignKey.reference().columns[0]?.name === "parentItemId" &&
          foreignKey.onDelete === "set null"
      )
    ).toBe(true);
    expect(
      getTableConfig(contentPublications).foreignKeys.some(
        foreignKey =>
          foreignKey.reference().columns[0]?.name ===
            "supersedesPublicationId" && foreignKey.onDelete === "restrict"
      )
    ).toBe(true);
  });
});
