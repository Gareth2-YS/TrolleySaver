# Deleting a pending product request: backend → frontend handoff

**Date:** 30 Oct 2026 · **From:** Gareth (backend) · **To:** frontend developer · **Status:** backend deployed to `dev` and tested end to end; **frontend not started**

This adds to the [new product requests handoff](2026-10-29-new-product-backend-to-frontend.md). A contributor can now delete one of their own product requests **while it is still pending**. Once an admin has approved or rejected it, it can't be deleted. The details are in the [API reference → `DELETE /product-requests/{id}`](../api/README.md#delete-product-requestsid).

## 1. What to build

In the contributor's list of requests (`GET /product-requests/mine`), add a **Delete** action on each request whose `status` is `pending`. Don't show it on approved or rejected ones.

1. Ask for confirmation, e.g. "Delete this request? Its picture will be removed too." The delete can't be undone.
2. Send `DELETE /product-requests/{id}` with the access token and no body.
3. On **`204`**, remove the request from the list. The same product can be proposed again straight away.

| Response | Show |
|---|---|
| `204` | Success. The request, its picture and its evidence photo are gone. |
| `404 NOT_FOUND` | "This request no longer exists." Refresh the list. |
| `409 ALREADY_MODERATED` | An admin has just decided it. Show `message` ("This product request is already approved."), then refresh the list so the new status shows. |

CORS now allows `DELETE` from `http://localhost:5173`.

## 2. Test checklist

Against `dev` with `VITE_AUTH_MODE=cognito`:

1. Propose a product. It shows as pending with a Delete action.
2. Delete it. It disappears from the list, and proposing the same product again works.
3. Approve or reject a request as an admin. The contributor's list no longer offers Delete for it.
4. Open the list in two tabs, approve the request as an admin, then delete it from the stale tab. You get the "already approved" message.

The backend side is covered by `backend/tests/test_product_requests.py`, the smoke test and `backend/TESTING.md` §10.9.
