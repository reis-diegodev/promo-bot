-- CreateTable
CREATE TABLE "ImageCache" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImageCache_query_key" ON "ImageCache"("query");
