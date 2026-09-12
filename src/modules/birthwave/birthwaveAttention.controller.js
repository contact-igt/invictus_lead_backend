import { listAttention, getAttention, updateAttention, reconcileAttention } from "./birthwaveAttention.service.js";

export const listAttentionHandler = async (req, res, next) => { try { res.status(200).json({ success: true, ...(await listAttention(req.tenant, req.query, req.user)) }); } catch (error) { next(error); } };
export const getAttentionHandler = async (req, res, next) => { try { res.status(200).json({ success: true, data: await getAttention(req.tenant, req.params.id, req.user) }); } catch (error) { next(error); } };
const action = (name) => async (req, res, next) => { try { res.status(200).json({ success: true, data: await updateAttention(req.tenant, req.params.id, name, req.user, req.body?.resolution_note) }); } catch (error) { next(error); } };
export const acknowledgeAttentionHandler = action("acknowledge");
export const resolveAttentionHandler = action("resolve");
export const dismissAttentionHandler = action("dismiss");
export const reconcileAttentionHandler = async (req, res, next) => { try { res.status(200).json({ success: true, data: await reconcileAttention(req.tenant, req.user) }); } catch (error) { next(error); } };
