/**
  * @ignore
  * BEGIN HEADER
  *
  * Contains:        Table rendering Plugin
  * CVM-Role:        CodeMirror Plugin
  * Maintainer:      Hendrik Erz
  * License:         GNU GPL v3
  *
  * Description:     This plugin renders tables in place.
  *
  * END HEADER
  */

import { commands } from 'codemirror'
import fromMarkdown from '../table-editor'
import { getTableHeadingRE } from '@common/regular-expressions'

const tables = []
const tableHeadingRE = getTableHeadingRE()

commands.markdownInsertTable = function (cm) {
  // A small command that inserts a 2x2 table at the current cursor position.
  cm.replaceSelection('| | |\n| | |\n')
}

/**
 * This function renders tables using the TableEditor
 *
 * @param   {CodeMirror.Editor}  cm  The editor instance
 */
commands.markdownRenderTables = function (cm) {
  // Now render all potential new tables. We only check one line less
  // because such a table header WILL NEVER be on the last line, plus
  // this way we can check for Setext headers without having to worry.

  // We'll only render the viewport
  const viewport = cm.getViewport()
  for (let i = viewport.from; i < viewport.to; i++) {
    if (cm.getModeAt({ 'line': i, 'ch': 0 }).name !== 'markdown-zkn') {
      continue
    }

    // First get the line and test if the contents resemble a table. We only
    // search for the heading rows here, because these are the only ones that
    // indicate a table. (Which is why none other than the really explicit
    // tables have syntax highlighting -- CodeMirror modes cannot do that).
    let firstLine // First line of a given table
    let lastLine // Last line of a given table
    let potentialTableType // Can be "grid", "pipe", "simple"

    const line = cm.getLine(i)
    const match = tableHeadingRE.exec(line)

    if (match == null) {
      continue // No table heading
    }

    if (match[1]) {
      // Group 1 triggered, so we might have a simple table.
      const nextLine = cm.getLine(i + 1)
      if (nextLine === undefined || nextLine.trim() === '') {
        // Either end of document or a setext heading
        continue
      }

      if (i === 0 || cm.getLine(i - 1).trim() === '') {
        // We have a headless table, so let's search the end.
        firstLine = i // First line in this case is i

        for (let j = i + 1; j < cm.lineCount(); j++) {
          const l = cm.getLine(j)
          if (l.trim() === '') {
            break // Leave without setting lastLine
          }

          const m = tableHeadingRE.exec(l)
          if (m !== null && m[1]) {
            lastLine = j
            break
          }
        }
      } else {
        // We do not have a headless table
        firstLine = i - 1
        for (let j = i; j < cm.lineCount(); j++) {
          if (cm.getLine(j).trim() === '') {
            // First empty line marks the end of the table.
            lastLine = j - 1
            break
          }
        }
      }

      potentialTableType = 'simple'
    } else if (match[2]) {
      // Group 2 triggered, so we maybe got a grid table. Grid tables may be
      // headerless or have a header. But the very first line will always
      // match the group, so we only have to look downward! As for pipe
      // tables, the first empty line marks the end of the table.
      // N.B.: We have this order of capturing groups because group 3 will
      // also match grid tables!
      firstLine = i
      for (let j = i + 1; j < cm.lineCount(); j++) {
        if (cm.getLine(j).trim() === '') {
          lastLine = j - 1
          break
        }
      }

      potentialTableType = 'grid'
    } else if (match[3]) {
      // Group 3 triggered, so we might have a pipe table. A pipe table must
      // have a header, which means we'll have an easy time determining the
      // table boundaries.
      if (i === 0 || cm.getLine(i - 1).trim() === '') continue // Nope
      firstLine = i - 1
      for (let j = i; j < cm.lineCount(); j++) {
        if (cm.getLine(j).trim() === '') {
          lastLine = j - 1
          break
        }
      }

      potentialTableType = 'pipe'
    }

    // Something went wrong
    if (lastLine === undefined || firstLine === undefined || firstLine === lastLine) {
      continue
    }

    // We've got ourselves a table! firstLine and lastLine now demarcate the
    // lines from and to which it goes. But before we continue with the table,
    // we need to set i to lastLine, because otherwise the renderer will
    // produce sometimes even overlapping tables, especially with simple ones.
    i = lastLine

    // First check if the user is not inside that table
    const cur = cm.getCursor('from')
    if (cur.line >= firstLine && cur.line <= lastLine) {
      continue
    }

    const curFrom = { 'line': firstLine, 'ch': 0 }
    const curTo = { 'line': lastLine, 'ch': cm.getLine(lastLine).length }

    // We can only have one marker at any given position at any given time
    if (cm.doc.findMarks(curFrom, curTo).length > 0) {
      continue
    }

    // A last sanity check: You could write YAML frontmatters by using only
    // dashes at the beginning and ending, which demarcates an edge condition.
    const beginningIsMd = cm.getModeAt(curFrom).name === 'markdown-zkn'
    // The mode will be Markdown again at the last character of the ending
    // separator from a YAML frontmatter, so it would render those as tables
    // as well. We have to check the FIRST character, as that would -- in the
    // case of a YAML frontmatter -- still be within YAML mode, not Markdown.
    const endingIsMd = cm.getModeAt({ line: curTo.line, ch: 0 }).name === 'markdown-zkn'

    if (!beginningIsMd || !endingIsMd) {
      continue
    }

    // First grab the full table
    const markdownTable = []
    for (let i = firstLine; i <= lastLine; i++) {
      markdownTable.push(cm.getLine(i))
    }

    // If the potential type is simple, there is one, last, final sanity check
    // we have to do: Users oftentimes forget to space out paragraphs when they
    // use Setext headings. That is, sometimes, the table editor will see
    // something like this:
    //
    // Some heading text
    // -----------------
    // The beginning of a paragraph
    //
    // This will lead to data loss, so we must make sure to not render simple
    // tables with one column.
    if (potentialTableType === 'simple' && markdownTable.length > 2 && /^-+$/.test(markdownTable[1])) {
      continue
    }

    // Now attempt to create a table from it.
    let tbl
    let textMarker
    try {
      // Will raise an error if the table is malformed
      tbl = fromMarkdown(markdownTable.join('\n'), potentialTableType, {
        // Detect mouse movement on the scroll element (so that
        // scroll detection in the helper works as expected)
        container: '#editor .CodeMirror .CodeMirror-scroll',
        onBlur: (t) => {
          // Don't replace some arbitrary text somewhere in the document!
          if (textMarker === undefined || textMarker.find() === false) {
            return
          }

          let found = tables.indexOf(t)
          let md = t.getMarkdownTable()
          // The markdown table has a trailing newline, which we need to
          // remove at all costs.
          md = md.substring(0, md.length - 1)

          // We'll simply replace the range with the new table. The plugin will
          // be called to re-render the table once again.
          const { from, to } = textMarker.find()
          cm.replaceRange(md.split('\n'), from, to)
          // If there's still the textmarker, remove it by force to re-render
          // the table immediately.
          if (textMarker !== undefined) {
            textMarker.clear()
          }

          // Splice the table and corresponding marker from the arrays
          if (found) {
            tables.splice(found, 1)
          }
        }
      })
    } catch (err) {
      console.error(`Could not instantiate table between ${firstLine} and ${lastLine}: ${err.message}`)
      // Error, so abort rendering.
      continue
    }

    // At this point, we have a fully rendered table and can insert it into
    // the DOM.

    // Apply TextMarker
    textMarker = cm.doc.markText(
      curFrom, curTo,
      {
        clearOnEnter: false,
        replacedWith: tbl.domElement,
        inclusiveLeft: false,
        inclusiveRight: false
      }
    )

    tables.push(tbl)
  }
}
