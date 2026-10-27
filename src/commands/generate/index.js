import { registerFeature } from './feature.js';
import { registerPage } from './page.js';
import { registerLayout } from './layout.js';
import { registerRoute } from './route.js';
import { registerService } from './service.js';
import { registerStore } from './store.js';
import { registerForm } from './form.js';
import { registerUi } from './ui.js';
import { registerComponent } from './component.js';

/** Attach every `lumen generate <kind>` subcommand to the generate command. */
export function registerGenerators(generate) {
  registerFeature(generate);
  registerPage(generate);
  registerLayout(generate);
  registerRoute(generate);
  registerService(generate);
  registerStore(generate);
  registerForm(generate);
  registerUi(generate);
  registerComponent(generate);
}
