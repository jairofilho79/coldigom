from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID


class BaseRepository(ABC):
    @abstractmethod
    def get_by_id(self, id: UUID):
        pass

    @abstractmethod
    def get_all(self, skip: int = 0, limit: int = 100) -> List:
        pass

    @abstractmethod
    def create(self, entity):
        pass

    @abstractmethod
    def update(self, entity):
        pass

    @abstractmethod
    def delete(self, id: UUID):
        pass






