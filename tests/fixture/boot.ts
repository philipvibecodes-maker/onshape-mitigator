// Import the production page adapter in the fixture's page world.
import "../../src/adapter/page";
import "../../src/main";
import { clickExtensionIcon } from "./browser";
(window as any).clickExtensionIcon = clickExtensionIcon;
