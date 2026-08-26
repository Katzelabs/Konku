import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { id } from '../../i18n/id'
import { en } from '../../i18n/en'
import { Emphasis } from './emphasis'

/**
 * The marker is only worth having if it survives both catalogs, so the two
 * sentences that use it are checked here rather than only the parser.
 *
 * The address is the reason these screens work: it is how somebody spots the
 * typo that explains the mail that never came. A catalog line that loses its
 * `*…*` pair renders a correct sentence with the emphasis silently gone, which
 * is exactly the kind of failure nothing else notices.
 */
describe('Emphasis', () => {
  it('emphasises the marked run and nothing else', () => {
    render(<Emphasis text="before *middle* after" />)

    const strong = screen.getByText('middle')
    expect(strong.tagName).toBe('STRONG')
    expect(document.body).toHaveTextContent('before middle after')
  })

  it('renders an unmarked string as itself', () => {
    const { container } = render(<Emphasis text="nothing marked here" />)

    expect(container).toHaveTextContent('nothing marked here')
    expect(container.querySelector('strong')).toBeNull()
  })

  it('leaves a lone asterisk alone', () => {
    const { container } = render(<Emphasis text="two * three" />)

    expect(container).toHaveTextContent('two * three')
    expect(container.querySelector('strong')).toBeNull()
  })

  for (const [locale, copy] of Object.entries({ id, en })) {
    it(`emphasises the address in ${locale}`, () => {
      const address = 'sena@example.com'

      for (const line of [
        copy.auth.checkMail.sentTo(address),
        copy.auth.forgot.sent.body(address),
      ]) {
        const { unmount } = render(<Emphasis text={line} />)
        expect(screen.getByText(address).tagName).toBe('STRONG')
        unmount()
      }
    })
  }
})
