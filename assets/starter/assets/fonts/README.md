# Bundled fonts (all SIL Open Font License 1.1; licence texts beside them)

| File | Family, weights | Covers |
|---|---|---|
| `SpaceGrotesk-VariableFont_wght.woff2` | Space Grotesk 300–700 | Latin |
| `NotoSansKR-VariableFont_wght.woff2` | Noto Sans KR 100–900 | Hangul, Latin, kana, many Han (Korean forms) |
| `NotoSansSC-Regular.subset.woff2`, `NotoSansSC-Black.subset.woff2` | Noto Sans SC 400, 900 | subset: GB2312 + Big5 level 1 + JIS X 0208 level 1 + Latin and punctuation (simplified and common traditional Chinese, kana) |
| `NotoSerifSC-Bold.subset.woff2` | Noto Serif SC 700 (from Noto Serif CJK SC 2.002) | the same subset |

The WOFF2 files are format conversions (and, for the SC files, character subsets) of the upstream fonts; glyphs are unchanged. Full fonts and more families (Noto Sans TC / JP, Noto Serif JP, brush and display faces): https://fonts.google.com. `check.mjs` WARNs about any lyric glyph these files do not cover; add a font then (references/engine.md §Fonts).
