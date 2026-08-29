import { fail, getBackend, ok } from "@/lib/api";

export async function POST() {
  try {
    const { client } = getBackend();
    const job = client.sync.startSyncAll();
    return ok({ job });
  } catch (error) {
    return fail(error);
  }
}