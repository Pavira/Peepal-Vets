from fastapi import APIRouter, HTTPException
from app.services.dashboard_service import DashboardService
from app.services.dashboard_stats_service import rebuild_dashboard_stats
import time

router = APIRouter()
dashboard_service = DashboardService()


# @router.get("/stats")
# def get_dashboard_stats():
#     """Get dashboard statistics."""
#     try:
#         stats = dashboard_service.get_stats()
#         return {"success": True, "data": stats}
#     except Exception as e:
#         raise HTTPException(status_code=400, detail=str(e))


@router.get("/stats")
def get_dashboard_stats():
    """Get dashboard statistics."""
    # start_total = time.time()
    try:
        # t0 = time.time()
        stats = dashboard_service.get_stats()
        # print(f"[TIME] Dashboard stats service call: {time.time() - t0:.4f}s")
        # print(f"[TIME] Dashboard stats TOTAL API: {time.time() - start_total:.4f}s")
        return {"success": True, "data": stats}
    except Exception as e:
        # print(f"[TIME] Dashboard stats TOTAL API (error): {time.time() - start_total:.4f}s")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/")
def get_dashboard():
    """Get precomputed dashboard metadata."""
    try:
        stats = dashboard_service.get_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/stats/rebuild")
def rebuild_stats():
    """Rebuild dashboard counters from existing collection data."""
    try:
        stats = rebuild_dashboard_stats()
        return {"success": True, "data": stats}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/low-stock")
def get_dashboard_low_stock(threshold: int = 50, limit: int = 10):
    """Get low stock drug details."""
    try:
        low_stock = dashboard_service.get_low_stock_drugs(threshold, limit)
        return {"success": True, "data": low_stock}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
