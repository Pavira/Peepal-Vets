import logging
import time
from app.core.firebase import get_firestore
from app.services.dashboard_stats_service import get_dashboard_stats

logger = logging.getLogger(__name__)


class DashboardService:
    def __init__(self):
        self.db = get_firestore()

    def get_stats(self) -> dict:
        """Fetch dashboard counters from precomputed metadata."""
        start_total = time.time()
        try:
            t0 = time.time()
            stats = get_dashboard_stats()
            print(
                f"[TIME] DashboardService.get_stats metadata fetch: {time.time() - t0:.4f}s"
            )

            print(f"[TIME] DashboardService.get_stats TOTAL: {time.time() - start_total:.4f}s")
            return stats
        except Exception as e:
            print(
                f"[TIME] DashboardService.get_stats TOTAL (error): {time.time() - start_total:.4f}s"
            )
            logger.error(f"Error fetching dashboard stats: {str(e)}")
            raise Exception(f"Failed to fetch dashboard stats: {str(e)}")

    def get_low_stock_drugs(self, threshold: int = 50, limit: int = 10) -> list:
        """Fetch low stock drugs sorted by quantity ascending."""
        start_total = time.time()
        try:
            t0 = time.time()
            query = (
                self.db.collection("drugs")
                .where("presentQuantity", "<", threshold)
                .order_by("presentQuantity", direction="ASCENDING")
                .limit(limit)
            )
            print(f"[TIME] DashboardService.get_low_stock_drugs query build: {time.time() - t0:.4f}s")

            t1 = time.time()
            docs = list(query.stream())
            print(f"[TIME] DashboardService.get_low_stock_drugs stream fetch: {time.time() - t1:.4f}s")

            t2 = time.time()
            low_stock = []
            for doc in docs:
                d = doc.to_dict() or {}
                low_stock.append(
                    {
                        "id": doc.id,
                        "name": d.get("name"),
                        "category": d.get("category", "General"),
                        "quantity": int(d.get("presentQuantity", 0) or 0),
                        "lastAddedDate": d.get("lastAddedDate", "N/A"),
                        "status": (
                            "critical"
                            if int(d.get("presentQuantity", 0) or 0) < 20
                            else "low"
                        ),
                    }
                )
            print(f"[TIME] DashboardService.get_low_stock_drugs normalize: {time.time() - t2:.4f}s")
            print(f"[TIME] DashboardService.get_low_stock_drugs TOTAL: {time.time() - start_total:.4f}s")

            return low_stock
        except Exception as e:
            print(
                "[TIME] DashboardService.get_low_stock_drugs TOTAL (error): "
                f"{time.time() - start_total:.4f}s"
            )
            logger.error(f"Error fetching low stock drugs: {str(e)}")
            raise Exception(f"Failed to fetch low stock drugs: {str(e)}")
