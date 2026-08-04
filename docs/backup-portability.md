# Backup path portability (M7B)

Bundles use relative paths with `/` separators and `logical://` roots. Absolute host paths and `..` segments are rejected. Cross-platform restore remaps areas under the target data root.
