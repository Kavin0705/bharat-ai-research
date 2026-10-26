import test from "node:test";
import assert from "node:assert/strict";
import { createLocationService } from "../locations.mjs";

test("PIN lookup validates codes and returns normalized post-office locality data", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    return new Response(JSON.stringify([{
      Status: "Success",
      PostOffice: [
        { Name: "Devanahalli ", District: "Bengaluru Rural", State: "Karnataka" },
        { Name: " Devanahalli ", District: "Bengaluru Rural", State: "Karnataka" },
        { Name: "Missing District", District: null, State: "Karnataka" },
      ],
    }]), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const locations = createLocationService();
    await assert.rejects(() => locations.pincode("12345"), { statusCode: 400 });
    assert.deepEqual(await locations.pincode("560001"), [
      { locality: "Devanahalli", district: "Bengaluru Rural", state: "Karnataka", pincode: "560001" },
    ]);
    assert.deepEqual(requested, ["https://api.postalpincode.in/pincode/560001"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
