<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/controllers/RoomController.php';
require_once __DIR__ . '/controllers/CleaningController.php';
require_once __DIR__ . '/controllers/InvoiceController.php';
require_once __DIR__ . '/controllers/ReportController.php';

$db = Database::getInstance();

$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = str_replace('/php-api', '', $uri);

$input = json_decode(file_get_contents('php://input'), true) ?: [];

$response = ['success' => false, 'error' => 'Not Found'];
$statusCode = 404;

try {
    if (strpos($uri, '/rooms') === 0) {
        $roomController = new RoomController($db);
        $roomId = null;
        
        if (preg_match('#/rooms/(\d+)/lock$#', $uri, $matches)) {
            $roomId = (int)$matches[1];
            if ($method === 'POST') {
                $response = $roomController->lock($roomId, $input);
                $statusCode = $response['success'] ? 200 : 400;
            }
        } elseif (preg_match('#/rooms/(\d+)/unlock$#', $uri, $matches)) {
            $roomId = (int)$matches[1];
            if ($method === 'POST') {
                $response = $roomController->unlock($roomId);
                $statusCode = $response['success'] ? 200 : 400;
            }
        } elseif (preg_match('#/rooms/(\d+)$#', $uri, $matches)) {
            $roomId = (int)$matches[1];
            if ($method === 'GET') {
                $response = $roomController->getById($roomId);
                $statusCode = $response['success'] ? 200 : 404;
            } elseif ($method === 'PATCH') {
                $response = $roomController->updateStatus($roomId, $input);
                $statusCode = $response['success'] ? 200 : 400;
            }
        } elseif ($uri === '/rooms/availability') {
            if ($method === 'GET') {
                $response = $roomController->getAvailability($_GET);
                $statusCode = 200;
            }
        } elseif ($uri === '/rooms' || $uri === '/rooms/') {
            if ($method === 'GET') {
                $response = $roomController->getAll($_GET);
                $statusCode = 200;
            }
        }
    }
    
    elseif (strpos($uri, '/cleaning') === 0) {
        $cleaningController = new CleaningController($db);
        $taskId = null;
        
        if (preg_match('#/cleaning/(\d+)$#', $uri, $matches)) {
            $taskId = (int)$matches[1];
            if ($method === 'GET') {
                $response = $cleaningController->getById($taskId);
                $statusCode = $response['success'] ? 200 : 404;
            } elseif ($method === 'PATCH') {
                $response = $cleaningController->updateStatus($taskId, $input);
                $statusCode = $response['success'] ? 200 : 400;
            }
        } elseif ($uri === '/cleaning' || $uri === '/cleaning/') {
            if ($method === 'GET') {
                $response = $cleaningController->getAll($_GET);
                $statusCode = 200;
            } elseif ($method === 'POST') {
                $response = $cleaningController->create($input);
                $statusCode = $response['success'] ? 201 : 400;
            }
        }
    }
    
    elseif (strpos($uri, '/invoices') === 0) {
        $invoiceController = new InvoiceController($db);
        $invoiceId = null;
        
        if (preg_match('#/invoices/(\d+)$#', $uri, $matches)) {
            $invoiceId = (int)$matches[1];
            if ($method === 'GET') {
                $response = $invoiceController->getById($invoiceId);
                $statusCode = $response['success'] ? 200 : 404;
            } elseif ($method === 'PATCH') {
                $response = $invoiceController->updateStatus($invoiceId, $input);
                $statusCode = $response['success'] ? 200 : 400;
            }
        } elseif ($uri === '/invoices' || $uri === '/invoices/') {
            if ($method === 'GET') {
                $response = $invoiceController->getAll($_GET);
                $statusCode = 200;
            } elseif ($method === 'POST') {
                $response = $invoiceController->create($input);
                $statusCode = $response['success'] ? 201 : 400;
            }
        }
    }
    
    elseif (strpos($uri, '/reports') === 0) {
        $reportController = new ReportController($db);
        
        if ($uri === '/reports/occupancy') {
            if ($method === 'GET') {
                $response = $reportController->getOccupancy($_GET);
                $statusCode = 200;
            }
        }
    }
    
    elseif ($uri === '/health' || $uri === '/') {
        $response = [
            'success' => true,
            'message' => '酒店PMS系统 PHP 后端运行正常',
            'timestamp' => date('c')
        ];
        $statusCode = 200;
    }
    
} catch (Exception $e) {
    $response = [
        'success' => false,
        'error' => '服务器内部错误',
        'message' => $e->getMessage()
    ];
    $statusCode = 500;
}

http_response_code($statusCode);
header('Content-Type: application/json');
echo json_encode($response, JSON_UNESCAPED_UNICODE);
