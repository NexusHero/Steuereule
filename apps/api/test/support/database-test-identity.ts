// The DB test tier seeds rows for several users and calls repositories and services directly, outside a
// request. Under row-level security (P11) those calls would see nothing, so they run as the `test-fixture`
// system identity. Every HTTP request of a suite still runs as its own user (DatabaseIdentityInterceptor), so
// the acceptance suites exercise the policies; `row-level-security.integration.test.ts` proves them directly.
import { useTestFixtureIdentityOutsideRequests } from '../../src/common/database-identity.js'

useTestFixtureIdentityOutsideRequests()
