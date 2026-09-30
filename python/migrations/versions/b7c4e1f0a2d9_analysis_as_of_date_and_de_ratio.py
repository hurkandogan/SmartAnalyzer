"""analysis_scores as_of_date + normalize stored Yahoo D/E percents to ratios

Revision ID: b7c4e1f0a2d9
Revises: ca09ce2a2b34
Create Date: 2026-09-28 22:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7c4e1f0a2d9"
down_revision: Union[str, Sequence[str], None] = "ca09ce2a2b34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("analysis_scores", sa.Column("as_of_date", sa.Date(), nullable=True))
    op.execute(
        """
        UPDATE analysis_scores
        SET as_of_date = (
            (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York'
        )::date
        WHERE as_of_date IS NULL
        """
    )
    op.execute(
        """
        DELETE FROM analysis_scores a
        USING analysis_scores b
        WHERE a.id < b.id
          AND a.symbol = b.symbol
          AND a.analysis_type = b.analysis_type
          AND a.as_of_date IS NOT DISTINCT FROM b.as_of_date
        """
    )
    op.alter_column("analysis_scores", "as_of_date", nullable=False)
    op.create_index(op.f("ix_analysis_scores_as_of_date"), "analysis_scores", ["as_of_date"], unique=False)
    op.create_unique_constraint(
        "uq_analysis_score_symbol_type_as_of",
        "analysis_scores",
        ["symbol", "analysis_type", "as_of_date"],
    )
    # Yahoo historically stored debtToEquity as percent (e.g. 150). Scoring uses ratio.
    op.execute(
        """
        UPDATE fundamentals
        SET debt_to_equity = debt_to_equity / 100.0
        WHERE debt_to_equity IS NOT NULL AND ABS(debt_to_equity) > 10
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE fundamentals
        SET debt_to_equity = debt_to_equity * 100.0
        WHERE debt_to_equity IS NOT NULL AND ABS(debt_to_equity) <= 10
        """
    )
    op.drop_constraint("uq_analysis_score_symbol_type_as_of", "analysis_scores", type_="unique")
    op.drop_index(op.f("ix_analysis_scores_as_of_date"), table_name="analysis_scores")
    op.drop_column("analysis_scores", "as_of_date")
