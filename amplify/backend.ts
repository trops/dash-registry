/**
 * Amplify Backend — Root Definition
 *
 * Combines auth, storage, and data resources into the Amplify backend.
 */
import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { storage } from "./storage/resource";
import { data } from "./data/resource";

defineBackend({
    auth,
    storage,
    data,
});
