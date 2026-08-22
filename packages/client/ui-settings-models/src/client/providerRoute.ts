/**
 * The hand-declared route id rule shared by every card that creates a
 * `llm-pi-ai` provider profile (the generic custom-provider card and the
 * Ollama quick-add card): a route id usable as a settings key AND as the stem
 * of a credential name.
 * @module dsh-client-ui-settings-models/client/providerRoute
 */

/**
 * A route id usable as a settings key AND as the stem of a credential name.
 * The leading letter is the second half of that: `deriveKeyRef` uppercases the
 * id and replaces every non-alphanumeric run with `_`, and a credential
 * reference is a POSIX shell identifier, which cannot start with a digit. A
 * digit-leading id passes every check a creation card makes and then fails at
 * the credential seam with a raw regular expression the user cannot act on.
 */
export const ROUTE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
