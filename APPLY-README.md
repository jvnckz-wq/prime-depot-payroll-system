# Prime Depot — HOTFIX: DeliveryForm crash "setDbl is not defined"

Replace src/components/DeliveryForm.jsx and commit. This fixes the runtime crash
that appeared after the #D10 change: a SECOND "Mark as Double" button (near the
trip total) still called the removed setDbl. It's now a read-only "Double rate
(auto)" chip — double rate stays automatic from the address area.

This DeliveryForm.jsx is the newest — it contains the Checker crash fix + #D10 +
#D11 + this hotfix. Use THIS one.

Validated: no setDbl references remain; esbuild parse + full bundle clean.
