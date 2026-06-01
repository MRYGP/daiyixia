export type SeedanceAssetSample = {
  id: string;
  name: string;
  assetId: string;
  note: string;
};

const configuredAssetIds = (process.env.NEXT_PUBLIC_SEEDANCE_ASSET_IDS || "")
  .split(",")
  .map((assetId) => assetId.trim())
  .filter(Boolean);

export const SEEDANCE_ASSETS: SeedanceAssetSample[] = configuredAssetIds.map((assetId, index) => ({
  id: `authorized-asset-${index + 1}`,
  name: `已授权真人素材 ${index + 1}`,
  assetId,
  note: "仅限已完成授权和入库的真人素材。",
}));
