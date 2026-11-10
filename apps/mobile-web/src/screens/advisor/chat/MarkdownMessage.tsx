import { memo, useMemo, type ReactNode } from 'react'
import { Linking, Pressable, Text, View, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native'
import { Renderer, useMarkdown, type MarkedStyles } from 'react-native-marked'
import { ADVISOR_LEGAL_SOURCES, type AdvisorLegalSource } from '@steuereule/core'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { linkLegalSources, safeLinkTarget, sourceFromLink } from './markdownLinks'

/**
 * Renders the owl's answers as Markdown (#451 slice 1b) on top of react-native-marked. The model
 * output is untrusted, so the renderer is narrowed: citations become law chips, only
 * http/https/mailto links open, and images are never fetched (the alt text is shown instead) — a
 * remote image would be a request to a third host.
 */
class ChatMarkdownRenderer extends Renderer {
  constructor(
    private readonly onSelectSource: (source: AdvisorLegalSource) => void,
    private readonly chipStyle: ViewStyle,
    private readonly chipTextStyle: TextStyle,
  ) {
    super({ selectable: true })
  }

  private keyCounter = 0
  private nextKey(): string {
    this.keyCounter += 1
    return `md-${this.keyCounter}`
  }

  override link(children: string | ReactNode[], href: string, styles?: TextStyle): ReactNode {
    const sourceId = sourceFromLink(href)
    if (sourceId) {
      const source = ADVISOR_LEGAL_SOURCES[sourceId]
      return (
        <Pressable
          key={this.nextKey()}
          accessibilityRole="button"
          accessibilityLabel={`Rechtsquelle ${source.paragraph}`}
          onPress={() => this.onSelectSource(source)}
          style={this.chipStyle}
          testID={`law-chip-${sourceId}`}
        >
          <Text style={this.chipTextStyle}>{`§ ${source.paragraph.replace(/^§\s*/, '')}`}</Text>
        </Pressable>
      )
    }
    const target = safeLinkTarget(href)
    if (target === null) {
      return (
        <Text key={this.nextKey()} style={styles}>
          {children}
        </Text>
      )
    }
    return (
      <Text key={this.nextKey()} accessibilityRole="link" style={styles} onPress={() => void Linking.openURL(target)}>
        {children}
      </Text>
    )
  }

  override image(_uri: string, alt?: string, _style?: ImageStyle, title?: string): ReactNode {
    const label = alt || title
    return label ? <Text key={this.nextKey()}>{`[${label}]`}</Text> : null
  }

  override linkImage(href: string, _imageUrl: string, alt?: string): ReactNode {
    return this.link(alt ? `[${alt}]` : href, href)
  }
}

export interface MarkdownMessageProps {
  readonly content: string
  readonly onSelectSource: (source: AdvisorLegalSource) => void
  readonly testID?: string | undefined
}

function MarkdownMessageView({ content, onSelectSource, testID }: MarkdownMessageProps) {
  const t = useTheme()
  const styles = useMemo(() => makeStyles(t), [t])
  const renderer = useMemo(
    () => new ChatMarkdownRenderer(onSelectSource, styles.chip, styles.chipText),
    [onSelectSource, styles],
  )
  const value = useMemo(() => linkLegalSources(content), [content])
  const elements = useMarkdown(value, { renderer, styles: styles.markdown })
  return (
    <View style={styles.box} testID={testID}>
      {elements}
    </View>
  )
}

/** Memoised so a streaming answer only re-renders when its text actually grows. */
export const MarkdownMessage = memo(MarkdownMessageView)

function makeStyles(t: UiTheme) {
  const text: TextStyle = { fontFamily: t.font.text, fontSize: t.size.m, lineHeight: 22, color: t.color.tinte }
  const markdown: MarkedStyles = {
    text,
    paragraph: { marginVertical: 2 },
    strong: { fontWeight: t.weight.fett },
    em: { fontStyle: 'italic' },
    link: { color: t.color.kiTinte, textDecorationLine: 'underline' },
    h1: { ...text, fontFamily: t.font.display, fontSize: t.size.xl, fontWeight: t.weight.schwer, marginVertical: 4 },
    h2: { ...text, fontFamily: t.font.display, fontSize: t.size.l, fontWeight: t.weight.schwer, marginVertical: 4 },
    h3: { ...text, fontWeight: t.weight.fett, marginVertical: 2 },
    h4: { ...text, fontWeight: t.weight.fett },
    codespan: { fontFamily: t.font.mono, fontSize: t.size.s, backgroundColor: t.color.grund, color: t.color.tinte },
    code: { backgroundColor: t.color.grund, padding: t.space.s2, borderRadius: t.radius.s },
    codeText: { fontFamily: t.font.mono, fontSize: t.size.s, color: t.color.tinte },
    li: text,
    list: { marginVertical: 2 },
    blockquote: { borderLeftWidth: 3, borderLeftColor: t.color.linie, paddingLeft: t.space.s2 },
    hr: { backgroundColor: t.color.linieWeich, height: 1, marginVertical: t.space.s2 },
    table: { borderWidth: 1, borderColor: t.color.linieWeich, marginVertical: t.space.s2 },
    tableRow: { borderBottomWidth: 1, borderColor: t.color.linieWeich },
    tableCell: { padding: t.space.s1 },
  }
  return {
    markdown,
    box: { gap: 2 } as ViewStyle,
    chip: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: t.radius.s,
      backgroundColor: t.color.kiWeich,
      alignSelf: 'flex-start',
    } as ViewStyle,
    chipText: { fontFamily: t.font.text, fontSize: t.size.xs, fontWeight: t.weight.fett, color: t.color.kiTinte } as TextStyle,
  }
}
