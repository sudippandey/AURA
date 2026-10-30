import { apiRequest } from "./apiClient.js";
import { ENDPOINTS } from "./endpoints.js";

export async function getBackendHealth() {
  return apiRequest(ENDPOINTS.health, { allowMock: false });
}
