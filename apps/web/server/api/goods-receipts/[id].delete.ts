import { eq } from "drizzle-orm";
import { schema, useDb } from "../../db/client.js";
import { readId, requireFound } from "../../utils/validation.js";
import { conflict, databaseError } from "../../utils/errors.js";

/**
 * Deletes a draft receipt with its positions and additional costs (G29).
 * Posted receipts stay: their entries carry the journal and FIFO; reverse
 * them instead. The number is not reused, so the sequence may show a gap.
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const db = useDb();
  const receipt = requireFound(
    await db.query.goodsReceipts.findFirst({
      where: eq(schema.goodsReceipts.id, id),
      columns: { state: true },
    }),
    "Der Wareneingang",
  );
  if (receipt.state !== "draft") {
    throw conflict(
      "Nur Entwürfe lassen sich löschen. Gebuchte Zugänge bitte im Bestandsjournal stornieren.",
    );
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.additionalCosts)
        .where(eq(schema.additionalCosts.goodsReceiptId, id));
      await tx
        .delete(schema.batches)
        .where(eq(schema.batches.goodsReceiptId, id));
      await tx
        .delete(schema.goodsReceipts)
        .where(eq(schema.goodsReceipts.id, id));
    });
  } catch (error) {
    throw databaseError(error, "Wareneingang löschen");
  }
  setResponseStatus(event, 204);
  return null;
});
