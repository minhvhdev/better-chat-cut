# Narration Timeline & Captions

`narration_apply_timeline` applies one atomic edit-session batch:

- optional A1 / C1 track creation
- temporary TTS scene audio items **or** whole-file voice-over item
- visual scene retime + VideoPlan metadata update
- caption data for the existing caption renderer
- reserved props key `__betterChatCutNarration`

Generic `update_item_props` cannot patch `__betterChatCutNarration`. Preview via `narration_preview_timeline`; inspect drift via `narration_validate_timeline`.
