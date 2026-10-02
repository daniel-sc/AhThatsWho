-- Immutable person-image verification metadata. Image payloads stay only in Drive.
CREATE TABLE drive_asset_verifications (
  origin TEXT NOT NULL,
  account_id TEXT NOT NULL,
  history TEXT NOT NULL,
  asset TEXT NOT NULL,
  file_id TEXT NOT NULL,
  drive_version TEXT NOT NULL,
  PRIMARY KEY (origin, account_id, history, asset)
);
