# Accessibility

Audited against WCAG 2.2 AA on 7 November 2026, using axe-core 4.10 and scripted checks in Chromium. No one has tested it with a screen reader yet, and automated checks can't replace that. See [Known limits](#known-limits).

## Automated scan

axe-core ran on every step and state at 1280x800 and 390x844: errors, Something else open, every selected colour, sending, a failed send, thanks and paused. It found **no violations**.

It flags one item as needing review: it can't work out the contrast on the chips, because a transparent input sits on top of each one. The contrast below is measured from the page instead.

## Contrast

Measured from the rendered page in every state. Normal text needs 4.5:1. Large text, 24 px or more, needs 3:1.

| Text | On | Ratio | Needs | Used for |
|---|---|---|---|---|
| Black | Off-White | 15.29 | 4.5 | Questions, hints, chips |
| Off-White | Black | 15.29 | 4.5 | Question tag |
| Black | Lime | 15.12 | 4.5 | Selected chip |
| Black | Light Gray | 12.87 | 4.5 | Pause button on hover |
| Maroon | Off-White | 10.15 | 4.5 | Error messages |
| Black | Teal | 10.13 | 4.5 | Selected chip |
| Black | Kelly Green | 7.82 | 4.5 | Selected chip |
| Black | Coral | 6.43 | 4.5 | Selected chip |
| Black at 70% | Off-White | 5.90 | 4.5 | Placeholder |
| Off-White | Purple | 4.19 | 3 | Next and Send, always 24 px or more |
| Lime | Purple | 4.15 | 3 | Thanks sticker, always 44 px or more |

Purple and Dark Blue aren't used as selected chip fills. Off-White on Purple is too low at chip size, and a dark chip would need a different check from the others. Every selected chip has the same black check and black text.

Controls and states, which need 3:1:

| Item | On | Ratio |
|---|---|---|
| Chip border, field underline, check box | Off-White | 15.29 |
| Tick inside the black check | Black | 6.43 or more |
| Focus ring on chips and fields (Purple) | Off-White | 4.19 |
| Focus ring on buttons (Dark Blue) | Off-White | 11.37 |

A selected chip keeps its black border, so a Lime chip doesn't lose its edge on the Off-White card. The tick means colour is never the only signal.

## Everything else checked

| Criterion | Result |
|---|---|
| 1.3.1, 4.1.2 Structure and names | Native radios and checkboxes, grouped and named by the question. One `h1` per step. Header, main and footer landmarks |
| 1.3.5 Input purpose | The name field has `autocomplete="name"` |
| 1.4.1 Use of colour | Selection has a tick, errors have an icon and text, progress has text |
| 1.4.4 Resize text | Type is in rem and each maximum is at most 2.5 times its minimum, so zoom always reaches 200%. Tested with a 200% browser text size |
| 1.4.5 Images of text | Only the logotype and the Adelaide label, which are part of the logo and have text alternatives |
| 1.4.10 Reflow | No sideways scrolling or clipped text at 320x568 and 320x256, or at 200% and 400% zoom, through the whole journey |
| 1.4.12 Text spacing | Nothing lost with the spacing overrides applied at 1280x800, 390x844 and 320x568 |
| 2.1.1, 2.1.2 Keyboard | The whole journey works from the keyboard, with no traps. Enter in the text area makes a new line and doesn't send |
| 2.1.4 Character shortcuts | There are none |
| 2.2.2 Pause, stop, hide | A Pause animation button stops the stickers and remembers the choice. Confetti lasts under 5 seconds |
| 2.3.3 Animation | Reduced motion gives a still pile, no confetti and no button |
| 2.4.2 Page titled | The title changes with each step, for example "Question 2 of 4: Friends of Figma Adelaide" |
| 2.4.3 Focus order | Options, then Back, then Next or Send, then the Pause button. Focus moves to the heading on each new step |
| 2.4.7, 2.4.11 Focus | Every control shows a clear focus style, and nothing covers it |
| 2.5.7 Dragging | Dragging only throws stickers, and tapping one also works |
| 2.5.8 Target size | The smallest target is the 44 px Back and Pause buttons, against a minimum of 24. Chips are 48 px high |
| 3.3.1, 3.3.3 Errors | Every error says what's wrong and how to fix it, moves focus to the problem, and links to it with `aria-invalid` and `aria-describedby`. Both clear once it's fixed |
| 3.3.2 Labels | Each question is its label, and Something else has its own visible label. Required fields are marked as required |
| 3.3.7 Redundant entry | Back keeps every answer, and so does a failed send |
| 4.1.3 Status messages | Sending is announced in a status region, and errors in an alert |

## When things go wrong

Tested with a stand-in for the Sheet, so no test touched the real one.

| What fails | What happens |
|---|---|
| Offline | "You're offline. Check your connection, then send again." The answers stay and sending works once it's back |
| No reply in 20 seconds | "That took too long. Send again." |
| Server error, a web page instead of a reply, or the script refusing | "We couldn't save your answers. Send again." |
| Send pressed more than once | Only one row is sent |
| Physics or stickers fail to load, or the background throws an error | The form works as normal, with no Pause button and no mention of throwing stickers |
| Browser storage blocked | The Pause button still works, but the choice isn't remembered |
| The font or images fail to load | The form still works, and the logo keeps its text alternative |
| JavaScript turned off | A message says to turn it on |
| A bot fills in the hidden field | It sees the thanks message, and nothing is sent |

## Known limits

- **Not tested with a screen reader.** The structure is right according to the scan, but it's worth 10 minutes with VoiceOver before this goes public.
- **Only tested in Chromium.** Safari and Firefox haven't been run, including on iPhone.
- **The stickers are pointer-only.** They're decoration and carry no information, so keyboard users miss nothing they need. The "Now throw some stickers around" line is hidden when motion is off.
- **Tapping Something else moves focus into its field.** That's a small change of context under 3.2.2, kept because the next step is always to type. It only happens with a mouse or touch, so arrow keys can still move through the options.
