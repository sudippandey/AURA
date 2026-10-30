const DEFAULT_TEST_URI = "mongodb://127.0.0.1:27017/aura_test";

export function getTestDbUri(): string {
  const uri = process.env.MONGODB_URI_TEST ?? DEFAULT_TEST_URI;
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("MONGODB_URI_TEST must be a valid local MongoDB URI for a disposable test database.");
  }

  if (
    !["mongodb:", "mongodb+srv:"].includes(parsed.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    !parsed.pathname.slice(1).endsWith("_test")
  ) {
    throw new Error("Tests only connect to a local MongoDB database whose name ends in _test.");
  }
  return uri;
}
