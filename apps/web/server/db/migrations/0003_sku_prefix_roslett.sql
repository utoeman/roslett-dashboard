-- Brand renamed to Roslett: SKU prefix TRD becomes ROS (one-time exception to immutable SKUs).
UPDATE "variants" SET "sku" = 'ROS-' || substr("sku", 5) WHERE "sku" LIKE 'TRD-%';
