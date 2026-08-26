import { useCopy } from '../../i18n'
import { ActiveSessions } from './ActiveSessions'
import { SettingsSection } from './SettingsSection'

/**
 * Where this account is signed in (07 L5), on its own screen.
 *
 * Deliberately not punitive and not alarming (hard rule 6). A list of your own
 * devices is not a security warning, so the copy stays factual: this is where
 * the account is open, and here is how to close one.
 */
export default function SessionsSettings() {
  const c = useCopy().settings.sessions

  return (
    <SettingsSection title={c.title} description={c.description}>
      <ActiveSessions />
    </SettingsSection>
  )
}
