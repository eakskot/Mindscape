import { DeviceActivitySelectionViewPersisted } from "react-native-device-activity";

import { BRAINROT_SELECTION_ID } from "./useScreenTime";

/**
 * Lets the user choose which apps/categories count toward the daily budget
 * (see useScreenTime.ts). The native "Persisted" picker variant stores the
 * selection under `familyActivitySelectionId` itself - we never learn which
 * apps were picked (Apple's privacy model: opaque tokens only), just this
 * fixed id to refer back to it by.
 *
 * Needs FamilyControls authorization already granted (useScreenTime's
 * `requestAccess`) - rendering it before that has happened is untested; the
 * caller is expected to gate on `isAuthorized`.
 */
export function BrainrotAppPicker() {
  return (
    <DeviceActivitySelectionViewPersisted
      familyActivitySelectionId={BRAINROT_SELECTION_ID}
      headerText="Choose the apps that count as brainrot"
      // Without this, picking a category (e.g. "Social") ignores the apps
      // inside it for our purposes - see the type's own doc link.
      includeEntireCategory
    />
  );
}
