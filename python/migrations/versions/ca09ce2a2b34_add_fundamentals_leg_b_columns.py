"""add fundamentals leg B columns

Revision ID: ca09ce2a2b34
Revises: 0217fc08699c
Create Date: 2026-09-13 22:33:34.919485

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ca09ce2a2b34'
down_revision: Union[str, Sequence[str], None] = '0217fc08699c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('fundamentals', sa.Column('forward_pe', sa.Float(), nullable=True))
    op.add_column('fundamentals', sa.Column('ps_ratio', sa.Float(), nullable=True))
    op.add_column('fundamentals', sa.Column('pb_ratio', sa.Float(), nullable=True))
    op.add_column('fundamentals', sa.Column('gross_margin', sa.Float(), nullable=True))
    op.add_column('fundamentals', sa.Column('operating_margin', sa.Float(), nullable=True))
    op.add_column('fundamentals', sa.Column('net_margin', sa.Float(), nullable=True))
    op.add_column('fundamentals', sa.Column('total_cash', sa.Float(), nullable=True))
    op.add_column('fundamentals', sa.Column('total_debt', sa.Float(), nullable=True))
    op.add_column('fundamentals', sa.Column('net_cash', sa.Float(), nullable=True))
    op.add_column('fundamentals', sa.Column('current_ratio', sa.Float(), nullable=True))
    op.add_column('fundamentals', sa.Column('debt_to_equity', sa.Float(), nullable=True))
    op.add_column('fundamentals', sa.Column('dividend_yield', sa.Float(), nullable=True))
    op.add_column('fundamentals', sa.Column('payout_ratio', sa.Float(), nullable=True))
    op.add_column('fundamentals', sa.Column('beta', sa.Float(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('fundamentals', 'beta')
    op.drop_column('fundamentals', 'payout_ratio')
    op.drop_column('fundamentals', 'dividend_yield')
    op.drop_column('fundamentals', 'debt_to_equity')
    op.drop_column('fundamentals', 'current_ratio')
    op.drop_column('fundamentals', 'net_cash')
    op.drop_column('fundamentals', 'total_debt')
    op.drop_column('fundamentals', 'total_cash')
    op.drop_column('fundamentals', 'net_margin')
    op.drop_column('fundamentals', 'operating_margin')
    op.drop_column('fundamentals', 'gross_margin')
    op.drop_column('fundamentals', 'pb_ratio')
    op.drop_column('fundamentals', 'ps_ratio')
    op.drop_column('fundamentals', 'forward_pe')
